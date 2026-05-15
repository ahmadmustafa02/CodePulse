// bad code for digest test
export async function getUser(id: any) {
    const query = `SELECT * FROM users WHERE id = ${id}`
    const result = await db.query(query)
    return result
  }
  
  export function parseConfig(input: string) {
    return eval(input)
  }