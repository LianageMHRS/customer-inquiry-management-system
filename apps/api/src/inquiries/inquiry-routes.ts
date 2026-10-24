import { Router } from 'express'
import { requireAuth } from '../auth/auth-middleware.js'
import {
  createInquiryHandler,
  getInquiry,
  listInquiries,
  updateInquiryStatus,
} from './inquiry-controller.js'

const router = Router()

router.use(requireAuth)
router.get('/', listInquiries)
router.post('/', createInquiryHandler)
router.get('/:id', getInquiry)
router.patch('/:id/status', updateInquiryStatus)

export { router as inquiryRouter }
