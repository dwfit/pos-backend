import { Schema, model } from 'mongoose';
const Category = new Schema({
  name: { type: String, index: true },
  sort: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
export default model('Category', Category);
