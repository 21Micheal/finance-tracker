// src/utils/currencyUtils.js

// 🌍 Base exchange rates (fallback)
export const exchangeRates = {
  USD: 1,        // base currency
  KES: 129.5,    // 1 USD = 129.5 KES
  EUR: 0.92,     // 1 USD = 0.92 EUR
  GBP: 0.79,     // 1 USD = 0.79 GBP
  INR: 84.0,     // 1 USD = 84 INR
  JPY: 150.0,    // 1 USD = 150 JPY
};

/**
 * 🔁 Convert amount from one currency to another.
 */
export function convertCurrency(amount, fromCurrency = "USD", toCurrency = "USD", rates = exchangeRates) {
  if (!amount || isNaN(amount)) return 0;
  if (fromCurrency === toCurrency) return parseFloat(amount);

  const fromRate = rates[fromCurrency] || exchangeRates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || exchangeRates[toCurrency] || 1;

  const converted = (amount / fromRate) * toRate;
  return parseFloat(converted.toFixed(2));
}

/**
 * 💱 Get the exchange rate from one currency to another.
 * Returns how many units of `toCurrency` equal 1 `fromCurrency`.
 */
export function getExchangeRate(fromCurrency = "USD", toCurrency = "USD", rates = exchangeRates) {
  if (fromCurrency === toCurrency) return 1;

  const fromRate = rates[fromCurrency] || exchangeRates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || exchangeRates[toCurrency] || 1;

  const rate = toRate / fromRate;
  return parseFloat(rate.toFixed(4));
}

/**
 * 💰 Format a number into a currency string.
 */
export function formatCurrency(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if Intl doesn't recognize the currency
    return `${currency} ${amount.toFixed(2)}`;
  }
}
