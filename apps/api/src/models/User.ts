import { Schema, model } from 'mongoose';
const User = new Schema({
  name: String,
  email: { type: String, unique: true, index: true },
  phone: String,
  passwordHash: String,
  role: { type: String, default: 'admin', index: true },
  branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  status: { type: String, default: 'active' },
  lastLoginAt: Date
}, { timestamps: true });
export default model('User', User);
