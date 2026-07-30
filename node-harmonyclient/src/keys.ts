import { subtle, webcrypto } from 'node:crypto'
import { eToStr, KeyPair } from './utils'

export async function importPrivateKey(privateKeyString: string) {
  // import private key
  let privateKeyBytes: Buffer
  try {
    privateKeyBytes = Buffer.from(privateKeyString, 'base64')
  } catch {
    throw new Error('Private key is not valid base64')
  }
  let privateKey: webcrypto.CryptoKey
  try {
    privateKey = await subtle.importKey('pkcs8', privateKeyBytes, 'Ed25519', false, ['sign'])
  } catch {
    throw new Error(
      'Private key could not be imported. Check that it is an Ed25519 key in PKCS#8+DER+base64 format'
    )
  }
  return privateKey
}

// returns b64 signature
export async function signWithPrivateKey(privateKey: webcrypto.CryptoKey, payload: string) {
  const signature = await subtle.sign('Ed25519', privateKey, Buffer.from(payload))
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

  return signatureBase64
}

export async function importPublicKey(publicKeyString: string) {
  let publicKeyBytes: Buffer
  try {
    publicKeyBytes = Buffer.from(publicKeyString, 'base64')
  } catch {
    throw new Error('Public key is not valid base64')
  }
  let publicKey: webcrypto.CryptoKey
  try {
    publicKey = await subtle.importKey('spki', publicKeyBytes, 'Ed25519', false, ['verify'])
  } catch {
    throw new Error(
      'Public key could not be imported. Check that it is an Ed25519 key in PKCS#8+DER+base64 format'
    )
  }
  return publicKey
}

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
    privateKey = await importPrivateKey(keyPair.privateKey)
  } catch (e) {
    return {
      isValid: false,
      message: eToStr(e)
    }
  }

  let publicKey: webcrypto.CryptoKey
  try {
    publicKey = await importPublicKey(keyPair.publicKey)
  } catch (e) {
    return {
      isValid: false,
      message: eToStr(e)
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

export async function signatureIsValid(
  publicKey: webcrypto.CryptoKey,
  payload: string,
  signatureB64: string
) {
  let signature: Buffer<ArrayBuffer>
  try {
    signature = Buffer.from(signatureB64, 'base64')
  } catch (e) {
    throw new Error('Signature is not valid base64')
  }
  return await subtle.verify('Ed25519', publicKey, signature, Buffer.from(payload))
}
