import { useEffect, useState } from "react";
import axios from "axios";
import { PlaidLink } from "react-plaid-link";
import { API_BASE_URL } from "@/config";

export default function ConnectPlaid() {
  const [linkToken, setLinkToken] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const res = await axios.post(`${API_BASE_URL}/plaid/link-token`);
        setLinkToken(res.data.link_token);
      } catch (err) {
        console.error("❌ Failed to get link token:", err);
      }
    };

    fetchLinkToken();
  }, []);

  const handleOnSuccess = async (public_token, metadata) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/plaid/exchange-token`, {
        public_token,
      });
      const token = res.data.access_token;
      setAccessToken(token);

      // Fetch accounts
      const accountsRes = await axios.post(`${API_BASE_URL}/plaid/accounts`, {
        access_token: token,
      });
      setAccounts(accountsRes.data.accounts);

      // Fetch transactions
      const txRes = await axios.post(`${API_BASE_URL}/plaid/transactions`, {
        access_token: token,
      });
      setTransactions(txRes.data.transactions);
    } catch (err) {
      console.error("❌ Error during Plaid flow:", err);
    }
  };

  if (!linkToken) return <p>Loading Plaid Link...</p>;

  return (
    <div className="flex flex-col items-center space-y-8 p-6">
      <PlaidLink token={linkToken} onSuccess={handleOnSuccess}>
        Connect Bank
      </PlaidLink>

      {accounts.length > 0 && (
        <div className="w-full max-w-2xl">
          <h3 className="text-xl font-semibold mt-6 mb-3">🏦 Linked Accounts</h3>
          <ul className="divide-y divide-gray-200">
            {accounts.map((acc, i) => (
              <li key={i} className="py-2">
                <p className="font-medium">{acc.official_name || acc.name}</p>
                <p className="text-sm text-gray-600">
                  {acc.subtype} ({acc.mask})
                </p>
                <p className="text-sm text-green-700">
                  Balance: ${acc.balances?.toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="w-full max-w-2xl mt-8">
          <h3 className="text-xl font-semibold mb-3">💳 Recent Transactions</h3>
          <ul className="divide-y divide-gray-100">
            {transactions.map((tx, i) => (
              <li key={i} className="py-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{tx.name}</p>
                    <p className="text-sm text-gray-500">
                      {tx.date} — {tx.category || "Uncategorized"}
                    </p>
                  </div>
                  <p
                    className={`font-semibold ${
                      tx.amount > 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    ${tx.amount.toFixed(2)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
