<script lang="ts" generics="S extends ReturnType<(typeof yup)['object']>">
  import * as yup from 'yup'
  import ExpandableBubble from './ExpandableBubble.svelte'
  import { collectYupErrorsByField } from '../misc/utils'
  interface Props {
    // eslint doesn't recognise the svelte generic types
    // all fields must be strings!
    // eslint-disable-next-line
    schema: S
    // eslint-disable-next-line
    labels: Record<keyof yup.InferType<S>, string>
    // eslint-disable-next-line
    cleanValues: yup.InferType<S>
    // eslint-disable-next-line
    onSubmit: (values: yup.InferType<S>, reset: () => void) => unknown
  }

  const props: Props = $props()
  let values = $state({ ...props.cleanValues })

  // if any of the values are different to the clean values.
  const isDirty = $derived.by(() => {
    for (const key of Object.keys(props.cleanValues)) {
      if (props.cleanValues[key] != values[key]) return true
    }
    return false
  })

  let showErrors = $state(false)
  let formErrors = $derived(collectYupErrorsByField(props.schema, values))

  // function for parent to reset the props to the clean versions.
  // also passed as a param in props.onSubmit
  export const reset = () => {
    showErrors = false
    values = { ...props.cleanValues }
  }

  // internal submit
  const handleSubmit: HTMLFormElement['onsubmit'] = (event) => {
    event.preventDefault()
    showErrors = true

    if (props.schema.isValidSync(values)) {
      // call parent submit
      props.onSubmit(values, reset)
    }
  }
</script>

<form onsubmit={handleSubmit}>
  {#each Object.keys(props.cleanValues) as field}
    <ExpandableBubble
      bind:value={values[field] as string}
      label={props.labels[field]}
      error={showErrors && formErrors[field].length > 0 ? formErrors[field][0] : undefined}
    />
  {/each}

  <input
    type="submit"
    id="submit"
    value="Save"
    disabled={!isDirty || (showErrors && !props.schema.isValidSync(values))}
  />
</form>
