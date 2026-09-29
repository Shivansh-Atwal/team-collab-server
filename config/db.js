import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import mongoose from "mongoose";
import User from "../models/User.js";

export default async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  mongoose.set("strictQuery", true);

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    const dbName = conn.connection.name;

    console.log(
      `MongoDB connected: ${conn.connection.host}/${dbName}`
    );

    // Sync indexes
    await User.syncIndexes();

    console.log("User indexes synchronized");

    return conn;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}