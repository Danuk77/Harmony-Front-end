<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import { sendFriendRequest } from '../../endpointIoWrappers'
  import { base64Regex } from '../../../../common/types'
  import ScrollContainer from '../../components/ScrollContainer.svelte'
  import MenuForm from '../../components/MenuForm.svelte'

  const formSchema = yup.object({
    pk: yup
      .string()
      .required('This field is required')
      .matches(
        base64Regex,
        'Public key should be a base64-encoded ed25519 verifying key exported in SPKI/DER format.'
      ),
    nickname: yup.string()
  })

  const formDefaults: yup.InferType<typeof formSchema> = {
    pk: '',
    nickname: ''
  }

  // let formValues = $state(formDefaults)

  // // list of string errors form each field
  // const formErrors = $derived(collectYupErrorsByField(formSchema, formValues))

  // // true once the user has submitted once
  // let showErrors = $state(false)

  const handleSubmit = (formValues: yup.InferType<typeof formSchema>) => {
    if (!$store.user.keyPair) {
      window.api.showErrorBox('Your public key is not set', 'Please set a public key and try again')
      return
    }

    if ($store.friendStates.find((fs) => fs.friend.peerPk == formValues.pk)) {
      window.api.showErrorBox('Friend not added', 'There is already a friend with this public key.')
      return
    }

    if (formSchema.isValidSync(formValues)) {
      // remove whitespace from pk
      const pk = formValues.pk.replace(/\s/g, '')

      // if no nickname provided just use the pk
      let nickname: string | undefined = formValues.nickname
      if (!nickname || nickname.length == 0) {
        nickname = pk
      }

      sendFriendRequest($store.user.keyPair.publicKey, pk, nickname)
    }
  }
</script>

<ScrollContainer>
  <MenuForm
    schema={formSchema}
    labels={{ pk: "Friend's Public Key", nickname: 'Nickname' }}
    onSubmit={handleSubmit}
    cleanValues={formDefaults}
  />
</ScrollContainer>
