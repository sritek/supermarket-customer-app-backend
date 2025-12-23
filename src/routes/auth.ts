import express from 'express';
import { signup, login, verifyOTP, resendOTP, logout, getMe } from '../controllers/auth';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

export default router;

