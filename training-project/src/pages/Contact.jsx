import { useCallback, useMemo, useState } from 'react'

const initialValues = {
  name: '',
  email: '',
  subject: '',
  message: '',
}

function Contact() {
  const [formValues, setFormValues] = useState(initialValues)
  const [touched, setTouched] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')

  const getWordCount = (value) => {
    const trimmed = value.trim()
    return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  }

  const validateField = useCallback((name, value) => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Name is required.'
        if (value.trim().length < 2) return 'Name must be at least 2 characters.'
        if (!/^[A-Za-zÀ-ÿ\s'-]+$/.test(value.trim())) {
          return 'Name can only contain letters, spaces, hyphens, or apostrophes.'
        }
        return ''
      case 'email':
        if (!value.trim()) return 'Email is required.'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.'
        return ''
      case 'subject':
        if (!value.trim()) return 'Subject is required.'
        if (value.trim().length < 3) return 'Subject must be at least 3 characters.'
        return ''
      case 'message': {
        const trimmed = value.trim()
        const wordCount = getWordCount(value)

        if (!trimmed) return 'Message is required.'
        if (wordCount < 10) return 'Message must contain at least 10 words.'
        return ''
      }
      default:
        return ''
    }
  }, [])

  const validateForm = useCallback(
    (values) => {
      const nextErrors = {}

      Object.entries(values).forEach(([name, value]) => {
        const error = validateField(name, value)
        if (error) {
          nextErrors[name] = error
        }
      })

      return nextErrors
    },
    [validateField],
  )

  const errors = useMemo(() => validateForm(formValues), [formValues, validateForm])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
    setTouched((current) => ({ ...current, [name]: true }))
    setSubmitMessage('')
  }

  const handleBlur = (event) => {
    const { name } = event.target
    setTouched((current) => ({ ...current, [name]: true }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const nextTouched = {
      name: true,
      email: true,
      subject: true,
      message: true,
    }

    setTouched(nextTouched)

    const newErrors = validateForm(formValues)

    if (Object.keys(newErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    setSubmitMessage('')

    window.setTimeout(() => {
      setIsSubmitting(false)
      setSubmitMessage('Thanks! Your message has been sent successfully.')
      setFormValues(initialValues)
      setTouched({})
    }, 1200)
  }

  const messageWordCount = getWordCount(formValues.message)
  const nameError = validateField('name', formValues.name)
  const emailError = validateField('email', formValues.email)
  const subjectError = validateField('subject', formValues.subject)
  const messageError = validateField('message', formValues.message)

  const isFormValid =
    !nameError &&
    !emailError &&
    !subjectError &&
    !messageError &&
    formValues.name.trim() &&
    formValues.email.trim() &&
    formValues.subject.trim() &&
    formValues.message.trim()

  return (
    <section className="page-card contact-card">
      <div className="contact-intro">
        <h2>Contact Us</h2>
        <p>Tell us about your project and we will get back to you shortly.</p>
      </div>

      <form className="contact-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Name</span>
          <input
            type="text"
            name="name"
            value={formValues.name}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="Your name"
          />
          {touched.name && errors.name ? <small className="error">{errors.name}</small> : null}
        </label>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            value={formValues.email}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="you@example.com"
          />
          {touched.email && errors.email ? <small className="error">{errors.email}</small> : null}
        </label>

        <label className="field">
          <span>Subject</span>
          <input
            type="text"
            name="subject"
            value={formValues.subject}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="What is this about?"
          />
          {touched.subject && errors.subject ? (
            <small className="error">{errors.subject}</small>
          ) : null}
        </label>

        <label className="field">
          <span>Message</span>
          <textarea
            name="message"
            rows="5"
            value={formValues.message}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="Write your message here"
          />
          <div className={`word-counter ${messageWordCount >= 10 ? 'word-counter--valid' : ''}`}>
            {messageWordCount}/10 words
          </div>
          {touched.message && errors.message ? (
            <small className="error">{errors.message}</small>
          ) : null}
        </label>

        <button type="submit" className="submit-button" disabled={!isFormValid || isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </button>

        {submitMessage ? <p className="success-message">{submitMessage}</p> : null}
      </form>
    </section>
  )
}

export default Contact
