const mongoose = require('mongoose');
const dotenv = require('dotenv');

process.on('uncaughtException', (err) => {
  console.log('UNHANDLER EXCEPTION!💥SHUTING DOWN 💥');
  console.log(err.name, err.message);
  process.exit(1);
});

dotenv.config({ path: './config.env' });
const app = require('./app');

mongoose
  .connect(process.env.DATABASE)
  .then((con) => console.log('DB Connection Successful!'))
  .catch((err) => console.error('DB Connection Error:', err));

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`App runinng on port ${port}...`);
});

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLER REJECTION! 💥SHUTING DOWN💥');
  console.log(err.name, err.message);

  server.close(() => {
    process.exit(1);
  });
});
