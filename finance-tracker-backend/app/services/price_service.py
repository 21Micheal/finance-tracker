# import yfinance as yf

# def fetch_current_price(symbol: str) -> float:
#     """
#     Fetch the latest market price for a stock/crypto symbol.
#     Example symbols:
#         Stocks: "AAPL", "TSLA"
#         Crypto: "BTC-USD", "ETH-USD"
#     """
#     try:
#         ticker = yf.Ticker(symbol)
#         data = ticker.history(period="1d")
#         if data.empty:
#             return None
#         return float(data["Close"].iloc[-1])
#     except Exception as e:
#         print(f"Error fetching price for {symbol}: {e}")
#         return None

import requests

API_URL = "https://api.coingecko.com/api/v3/simple/price"

def fetch_current_price(symbol: str, currency: str = "usd"):
    """
    Fetch current price for a given crypto/stock symbol.
    For now, using CoinGecko (crypto). You can extend for stocks later.
    """
    try:
        response = requests.get(API_URL, params={
            "ids": symbol.lower(),
            "vs_currencies": currency
        })
        data = response.json()
        return float(data[symbol.lower()][currency])
    except Exception as e:
        print(f"Error fetching price for {symbol}: {e}")
        return None
