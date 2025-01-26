<script lang="ts">
  import * as yup from 'yup'

  type FormValues = {
    pk: string
    nickname?: string
  }

  let formValues: FormValues = {
    pk: '',
    nickname: undefined
  }

  const schema: yup.Schema<FormValues> = yup.object({
    pk: yup
      .string()
      .required('This field is required')
      .matches(
        /^\s*[0123456789abcdefABCDEF]{128}\s*$/,
        'Public key should be 128 hexadecimal digits'
      ),
    nickname: yup.string()
  })

  const handleSubmit = () => {
    schema.validate(formValues)
  }
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      <form on:submit|preventDefault={handleSubmit}>
        <div class="bubble">
          <div
            contenteditable="true"
            class="textInput"
            role="textbox"
            tabindex="0"
            bind:innerText={formValues.pk}
          >
            hello
          </div>
        </div>
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
    margin-top: auto; /*bottom-justifys content*/
    width: 90%;
    max-width: 700px;
    display: flex;
    flex-direction: column;
  }
  .bubble {
    border-radius: 18px;
    padding: 4px;
    padding-left: 8px;
    padding-right: 8px;
    word-break: break-word;
    white-space: pre;
    background-color: var(--color-input-box);
    max-width: 700px;
    width: 90%;
    margin-bottom: 20px;
    min-height: 30px;
  }
  .textInput {
    color: var(--color-text-black);
    border: none;
    resize: none;
    text-wrap: start;
  }
</style>
