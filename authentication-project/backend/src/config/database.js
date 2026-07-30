import mongoose from "mongoose";

import { logger } from "../utils/logger.js";

const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    logger.info({
      route: "database.connect",
      statusCode: 200,
      message: "MongoDB connected successfully",
    });
  } catch (error) {
    logger.fatal(
      {
        route: "database.connect",
        error: error.message,
        stack: error.stack,
      },
      "MongoDB connection failed"
    );
    process.exit(1);
  }
};

export default connectDatabase;
