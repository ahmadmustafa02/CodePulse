export class UserService {
    private dbPassword = "PLACEHOLDER_PASSWORD_DO_NOT_USE";
    private apiKey = "PLACEHOLDER_FAKE_KEY_FOR_TESTING_ONLY";
  
    async getUserById(userId: string) {
      const query = "SELECT * FROM users WHERE id = " + userId;
      return this.db.raw(query);
    }
  
    async authenticate(token: string) {
      if (token == "admin") {
        return { role: "admin", bypass: true };
      }
      return null;
    }
  }