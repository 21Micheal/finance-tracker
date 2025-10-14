import { createContext, useContext, useEffect, useState } from "react";
import { convertCurrency, formatCurrency, exchangeRates } from "@/utils/currencyUtils";

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("USD");
  const [rates, setRates] = useState(exchangeRates); // fallback rates
  const [loadingRates, setLoadingRates] = useState(false);

  // Optional: fetch live exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        setLoadingRates(true);
        const res = await fetch("https://api.exchangerate.host/latest?base=USD");
        const data = await res.json();
        if (data?.rates) setRates(data.rates);
      } catch (err) {
        console.error("Failed to fetch live exchange rates:", err);
      } finally {
        setLoadingRates(false);
      }
    };
    fetchRates();
  }, []);

  const value = {
    currency,
    setCurrency,
    rates,
    loadingRates,
    convert: (amount, from = "USD") => convertCurrency(amount, from, currency, rates),
    format: (amount, from = "USD") => formatCurrency(convertCurrency(amount, from, currency, rates), currency),
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
