import { Schema, model } from 'mongoose';
const Device = new Schema({
  deviceId: { type: String, index: true },
  platform: { type: String, enum: ['android','ios'] },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
  status: { type: String, enum: ['active','blocked','revoked'], default: 'active', index: true },
  activationKeyHash: String,
  lastSeenAt: Date,
  appVersion: String,
  expiresAt: Date
}, { timestamps: true });
export default model('Device', Device);
