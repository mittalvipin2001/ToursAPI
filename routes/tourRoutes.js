const express = require('express');
const tourController = require('../controllers/tourController');
const authController = require('../controllers/authController');
const reviewRouter = require("./reviewRoutes");


const router = express.Router();

// router.param('id',tourController.checkId);

//POST /tour/231fksl/reviews
//GET /tour/231fksl/reviews
//POST /reviews

router.use('/:tourId/reviews', reviewRouter);

router
  .route('/top-5-cheap')
  .get(tourController.aliasTopTours, tourController.getAllTours);

router
  .route('/tour-stats')
  .get(tourController.getTourStats);

router
  .route('/monthly-plan/:year')
  .get(
    authController.protect,
    authController.restrictTo('admin','lead-guide','guide'),
    tourController.getMonthlyPlan
);

router
    .route('/tours-within/:distance/centre/:latlng/unit/:unit')
    .get(
      tourController.getToursWithin
  );

router
    .route('/distances/:latlng/unit/:unit')
    .get(tourController.getDistances);

router.post('/',
  authController.protect,
  authController.restrictTo('admin','lead-guide'),
  tourController.createTour
);

router.delete('/:id', 
  authController.protect,
  authController.restrictTo('admin','lead-guide'),
  tourController.deleteTour
);

router.patch('/:id',
  authController.protect,
  authController.restrictTo('admin','lead-guide'),
  tourController.uploadTourImages,
  tourController.resizeTourImages,
  tourController.updateTour
);

router.get('/', tourController.getAllTours);
router.get('/:id', tourController.getTourById);


module.exports = router;



