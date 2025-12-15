import { Schema, model } from 'mongoose';
const SizeSchema = new Schema({ name: String, price: Number, code: String }, { _id: false });
const Product = new Schema({
  sku: { type: String, unique: true, index: true },
  name: String,
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  basePrice: Number,
  taxRate: { type: Number, default: 0.15 },
  sizes: [SizeSchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
export default model('Product', Product);
