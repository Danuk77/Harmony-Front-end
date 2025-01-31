<script lang="ts">
  import * as yup from 'yup'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'
  import { store } from '../../redux'

  const formSchema = yup.object({
    pk: yup
      .string()
      .required('This field is required')
      .matches(
        /^\s*[0123456789abcdefABCDEF]{128}\s*$/,
        'Public key should be 128 hexadecimal digits'
      ),
    nickname: yup.string()
  })

  const formDefaults: yup.InferType<typeof formSchema> = {
    pk: '',
    nickname: ''
  }

  let formValues = $state(formDefaults)

  // list of string errors form each field
  type FormErrors = Record<keyof yup.InferType<typeof formSchema>, string[]>
  const formErrors = $derived.by<FormErrors>(() => {
    // empty FormErrors obj.
    const errors = Object.fromEntries(
      Object.keys(formValues).map((key) => [key, [] as string[]])
    ) as FormErrors

    // validate and collect errors
    try {
      formSchema.validateSync(formValues, { abortEarly: false })
    } catch (e) {
      if (e instanceof yup.ValidationError) {
        // errors come through individually, even if there are multiple errors in a field
        // loop through and add to lists.
        for (const validationError of e.inner) {
          if (validationError.path) {
            errors[validationError.path].push(validationError.message)
          }
        }
      }
    }

    return errors
  })

  // true once the user has submitted once
  let showErrors = $state(false)

  const handleSubmit: HTMLFormElement['onsubmit'] = (event) => {
    event.preventDefault()
    showErrors = true

    if (!$store.connection.pk) {
      alert('Your public key is not set. Please set a public key and try again')
      return
    }

    if (formSchema.isValidSync(formValues)) {
      // if no nickname provided just use the pk
      let nickname: string | undefined = formValues.nickname
      if (!nickname || nickname.length == 0) {
        nickname = formValues.pk
      }

      window.api.sendFriendRequest($store.connection.pk, formValues.pk, nickname).then((result) => {
        switch (result.status) {
          case 'fail':
            window.api.showErrorBox('Failed to send friend request', result.msg)
            break
          case 'offline':
            window.api.showErrorBox('Failed to send friend request', 'Friend is offline')
            break
          case 'succeed':
            switch (result.type) {
              case 'accept':
                store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
                break
              case 'reject':
                window.api.showErrorBox(
                  'Request rejected',
                  'You friend request was rejected by the peer'
                )
                break
              case 'pending':
                store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
                break
            }
        }
      })
    }
  }
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      <form onsubmit={handleSubmit}>
        <ExpandableBubble
          bind:value={formValues.pk}
          label="Friend's Public Key"
          error={showErrors && formErrors.pk.length > 0 ? formErrors.pk[0] : undefined}
        />
        <ExpandableBubble
          bind:value={formValues.nickname}
          label="Nickname"
          error={showErrors && formErrors.nickname.length > 0 ? formErrors.nickname[0] : undefined}
        />
        <input type="submit" id="submit" value="Confirm" />
      </form>
    </div>
  </div>
</div>

<style>
  #container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
  }
  #scroll-container {
    width: 100%;
    overflow-y: scroll;
    align-items: center;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
  }
  #form {
    /* margin-top: auto; bottom-justifys content */
    margin-top: 20px;
    margin-bottom: 20px;
    width: 90%;
    max-width: 700px;
    display: flex;
    flex-direction: column;
  }
</style>
