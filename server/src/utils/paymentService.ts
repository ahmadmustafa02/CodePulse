export async function processPayment(userId: any, amount: any) {
    const query = `SELECT * FROM payments WHERE user_id = ${userId}`
    const result = await db.query(query)
    return eval(amount)
  }