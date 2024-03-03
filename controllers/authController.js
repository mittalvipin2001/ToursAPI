const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

const signToken = id => jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
      ),
    httpOnly: true
  };
  
  if(process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  
  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role
  });
  const url = `${req.protocol}://${req.get('host')}/me`;
  await new Email(newUser, url).sendWelcome();

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Check if email and password the user exists
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }

  // Check if the user exists and if the provided password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect Credentials', 401));
  }

  // Generate a token for the authenticated user
  createSendToken(user, 200, res);
});

exports.logout = (req, res) =>{
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  } )
  res.status(200).json({ status:'success'});
}

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and Check of it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token){
    return next(
      new AppError('You Are Not Logged In! Please Login To Get Access.', 401)
    );
  }
  // 2) Verfication Token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);


  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if(!currentUser) {
    return next(
      new AppError('The User Belonging To This Token Does No Longer Exist.', 401)
      );
  }

  // 4) Check if User changed password After the token was issued
   if (currentUser.changedPasswordAfter(decoded.iat)){
    return next (
      new AppError('User Recently Changed Password! Please Login Again', 401)
    );
  }

  // Grant ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

//Only for rendered Pages, no Errors;
exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try{
      //1) Verify The Token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if(!currentUser) {
        return next();
      }

      // 3) Check if User changed password After the token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)){
        return next ( );
      }

      // There is a Logged In User
      res.locals.user = currentUser;
      return next();
    }catch(err){
      return next();
    }
  }
  next();
};

exports.restrictTo = (...roles) => (req, res, next) => {
// roles ['admin','lead-guide',]
    if (!roles.includes(req.user.role)){
      return next(
      new AppError('You Do Not Have Permission To Perform This Action', 403)
    );
  }

  next();
  };

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get User Based On Posted Email
  const user = await User.findOne({email: req.body.email});
  if (!user) {
    return next(new AppError('There Is No User With This email Address', 404))
  }
  // 2) Generate The Random Reset Token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status:'success',
      message: 'Token sent To Email'
    });
  } catch(err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('There Was An Error Sending The EMail. Try Again Later!'), 500);
  } 
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get User Based ON The Token 
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() } 
  });
  
  // 2) If Token has Not Expired, And There Is User, Set The New Password
  if (!user){
    return next(new AppError('Token Is Invalid Or Expired', 404))
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update The changePasswordAt Property For The User

  // 4) Log The User In, send JWT
  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get A User From The Collection
  const user =  await User.findById(req.user.id).select('+password');

  // 2) Check if Posted Password Is Correct 
  if (!(user.correctPassword(req.body.passwordCurrent, user.password))){
    return next(new AppError('Your Current Password IS Wrong', 401))
  }
  // 3) If So, Then Update The Password 
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4) Log User In Send JWT
  createSendToken(user, 200, res);
  
});