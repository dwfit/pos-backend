import { Schema, model } from 'mongoose';
const PaymentSchema = new Schema({ method: String, amount: Number, ref: String }, { _id: false });
const LineSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  size: String,
  qty: Number,
  unitPrice: Number,
  tax: Number,
  total: Number,
  discounts: [{ name: String, amount: Number }]
}, { _id: false });

const Order = new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
  channel: { type: String, enum: ['POS','CallCenter','Aggregator'], index: true },
  orderNo: { type: String, unique: true },
  businessDate: { type: Date, index: true },
  status: { type: String, enum: ['draft','pending','active','declined','paid','cancelled','returned'], index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  deviceId: { type: Schema.Types.ObjectId, ref: 'Device' },
  items: [LineSchema],
  subtotal: Number,
  discountTotal: Number,
  taxTotal: Number,
  netTotal: Number,
  payments: [PaymentSchema],
  zATCA: { xmlHash: String, qr: String, uuid: String, status: String },
  closedAt: Date
}, { timestamps: true });

Order.index({ branchId: 1, businessDate: 1 });
export default model('Order', Order);
