import { api } from "../../lib/api";
import { CustomerBrowser } from "../../components/customer-browser";

export default async function CustomersPage() {
  const customers = await api.customers();
  return <CustomerBrowser customers={customers} />;
}
