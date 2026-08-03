import axios from '../api/axios';

/**
 * Starts WhatsApp onboarding:
 * Create AiSensy business → create AiSensy project → return Meta Embedded Signup URL.
 */
export async function connectWhatsAppOnboarding({
  companyName,
  email,
  mobile,
  projectId,
  projectName,
  returnOrigin,
} = {}) {
  const response = await axios.post('/onboarding/connect-whatsapp', {
    companyName,
    email,
    mobile,
    projectId,
    projectName,
    returnOrigin,
  });
  return response.data;
}
