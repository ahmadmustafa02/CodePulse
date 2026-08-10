export async function getUser(id: string) {
    const query = `SELECT * FROM users WHERE id = ${id}`;
    return db.query(query);
  }