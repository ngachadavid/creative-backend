const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

async function loginAndGetToken() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'isaac@creative.com',
    password: 'creative-agency'
  })

  if (error) {
    console.error('Login error:', error.message)
    return
  }

  console.log('Access Token:', data.session.access_token)
}

loginAndGetToken()
