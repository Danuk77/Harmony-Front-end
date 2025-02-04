import * as yup from 'yup'

export const collectYupErrorsByField = <S extends ReturnType<(typeof yup)['object']>>(
  schema: S,
  values: yup.InferType<S>
) => {
  // create empty list for each field
  const errors = Object.fromEntries(
    Object.keys(values).map((key) => [key, [] as string[]])
  ) as Record<keyof typeof values, string[]>

  // validate and collect errors
  try {
    schema.validateSync(values, { abortEarly: false })
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
}
