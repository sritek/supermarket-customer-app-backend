import Razorpay from "razorpay";

let razorpay: Razorpay;

export const initRazorpay = () => {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "",
  });
};

export const getRazorpay = () => {
  if (!razorpay) {
    initRazorpay();
  }
  return razorpay;
};
