export const formatCurrency = (amount, currency = "USD", rate = 1) => {
  const converted = amount * rate;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(converted);
  } catch {
    return `${currency} ${converted.toFixed(2)}`;
  }
};
