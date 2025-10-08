import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized() {
      return false;
    },
  },
});
