import axios from "axios";

const API_URL = "http://localhost:8000/api/plaid";

export async function createLinkToken() {
  const response = await axios.post(`${API_URL}/link-token`);
  return response.data.link_token;
}

export async function exchangePublicToken(publicToken) {
  const response = await axios.post(`${API_URL}/exchange-token`, {
    public_token: publicToken,
  });
  return response.data.access_token;
}
