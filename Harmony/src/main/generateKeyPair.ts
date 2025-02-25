import { KeyPair } from '../common/redux'
import { subtle, webcrypto } from 'node:crypto'

/**
 * Generate a new key pair using Ed25519, and export in pkcs#8/DER/base64.
 * @returns
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // generate
  const key = (await subtle.generateKey('Ed25519', true /*extractable*/, [
    'sign' /*Not actually using this, but have to put something here else error*/
  ])) as webcrypto.CryptoKeyPair

  // export and convert to b64
  const publicKey = await subtle.exportKey(
    'spki' /**this is actually pkcs1 for public keys */,
    key.publicKey
  )
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKey)))
  const privateKey = await subtle.exportKey('pkcs8', key.privateKey)
  const privateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(privateKey)))

  return {
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64
  }
}

export type KeyPairVeificationResult =
  | {
      isValid: true
      message?: undefined
    }
  | {
      isValid: false
      message: string
    }

/**
 * Check that public and private keys form a pair.
 * @param keyPair
 * @returns
 */
export async function verifyKeyPair(keyPair: KeyPair): Promise<KeyPairVeificationResult> {
  // import keys
  let privateKey: webcrypto.CryptoKey
  try {
    privateKey = await subtle.importKey(
      'pkcs8',
      Buffer.from(keyPair.privateKey, 'base64'),
      'Ed25519',
      false,
      ['sign']
    )
  } catch {
    return {
      isValid: false,
      message:
        'The private key is not in the correct format. It should be an Ed25519 private key exported in PKCS#8/DER and encoded in base64.'
    }
  }

  let publicKey: webcrypto.CryptoKey
  try {
    publicKey = await subtle.importKey(
      'spki',
      Buffer.from(keyPair.publicKey, 'base64'),
      'Ed25519',
      false,
      ['verify']
    )
  } catch {
    return {
      isValid: false,
      message:
        'The public key is not in the correct format. It should be an Ed25519 public key exported in SPKI/DER and encoded in base64.'
    }
  }

  // sign with the private key and verify with the public key
  const message = Buffer.from('Arbitrary message')
  const signature = await subtle.sign('Ed25519', privateKey, message)
  const result = await subtle.verify('Ed25519', publicKey, signature, message)

  if (!result) {
    return {
      isValid: false,
      message: 'The keys do not match.'
    }
  }

  return {
    isValid: true
  }
}
