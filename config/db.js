import mongoose from "mongoose";

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    // Connect to MongoDB using the connection string from environment variables
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
