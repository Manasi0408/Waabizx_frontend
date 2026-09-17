function parseBracketErrorCode(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^\[(\d+)\]\s*(.*)$/);
  if (!match) return { code: null, message: raw || null };
  return {
    code: match[1] || null,
    message: String(match[2] || '').trim() || raw,
  };
}

/** Normalize failed delivery details from inbox/live-chat message objects. */
export function getDeliveryFailureInfo(message, status) {
  const deliveryStatus = String(status || message?.status || '').toLowerCase();
  if (deliveryStatus !== 'failed') return null;

  const payload = message?.payload && typeof message.payload === 'object' ? message.payload : null;
  const payloadErrors = Array.isArray(payload?.errors) ? payload.errors : [];
  const firstPayloadError = payloadErrors[0] || null;

  let errorCode =
    message?.errorCode ??
    message?.error_code ??
    firstPayloadError?.code ??
    payload?.error_code ??
    null;

  let errorMessage =
    message?.errorMessage ??
    message?.error_message ??
    payload?.error ??
    firstPayloadError?.title ??
    firstPayloadError?.message ??
    firstPayloadError?.error_data?.details ??
    null;

  if (errorMessage && !errorCode) {
    const parsed = parseBracketErrorCode(errorMessage);
    errorCode = parsed.code;
    errorMessage = parsed.message;
  }

  errorCode = errorCode != null && String(errorCode).trim() !== '' ? String(errorCode).trim() : null;
  errorMessage =
    errorMessage != null && String(errorMessage).trim() !== ''
      ? String(errorMessage).trim()
      : 'Message not delivered';

  return { errorCode, errorMessage };
}
