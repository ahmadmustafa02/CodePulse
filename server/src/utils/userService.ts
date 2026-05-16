export async function getUser(id: any) {
    const user = await db.query(`SELECT * FROM users WHERE id = ${id}`)
    console.log(user)
    return user
  }
  
  export function deleteUser(id: any) {
    db.query(`DELETE FROM users WHERE id = ${id}`)
  }