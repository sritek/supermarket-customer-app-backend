import express from 'express';
import {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} from '../controllers/user';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

router.use(authenticate);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.put('/addresses/:addressId', updateAddress);
router.delete('/addresses/:addressId', deleteAddress);
router.patch('/addresses/:addressId/default', setDefaultAddress);

export default router;

