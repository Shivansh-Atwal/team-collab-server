import mongoose from 'mongoose';
import User from '../models/User.js';

export default async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teamcollab';
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri);
  const dbName = conn.connection.name;
  console.log(`MongoDB connected: ${conn.connection.host}/${dbName}`);

  if (dbName === 'test') {
    console.warn(
      'Warning: using the default "test" database. Put the database name before the "?" in MONGO_URI, ' +
        'e.g. mongodb+srv://user:pass@cluster.mongodb.net/teamcollab?appName=Cluster0'
    );
  }

  // Drop unique indexes left over from other apps (e.g. "username_1") that would block signups
  const dropped = await User.syncIndexes();
  if (dropped.length) console.log(`Removed stale user indexes: ${dropped.join(', ')}`);

  return conn;
}
