// intentionally bad code for testing Groq analysis
import { db } from './db'

export async function getUser(id: any) {
  const query = `SELECT * FROM users WHERE id = ${id}`
  const result = await db.query(query)
  return result
}

export function parseConfig(input: string) {
  return eval(input)
}

export async function fetchData(url: string) {
  const response = await fetch(url)
  const data = response.json()
  return data
}

export function divide(a: number, b: number) {
  return a / b
}