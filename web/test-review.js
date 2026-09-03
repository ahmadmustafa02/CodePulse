// test file with intentional bugs for CodePulse review
async function getUser(id) {
    const query = `SELECT * FROM users WHERE id = ${id}`
    const result = await db.query(query)
    return result
  }
  
  function parseConfig(input) {
    return eval(input)
  }
  
  async function fetchData(url) {
    const response = await fetch(url)
    const data = response.json()
    return data
  }
  
  function divide(a, b) {
    return a / b
  }