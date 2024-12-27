export const generateOtp = (length = 6) => {
  const digits = "0123456789";
  let otp = "";

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }

  return otp;
};
