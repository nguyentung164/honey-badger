export interface ValidationResult {
  isValid: boolean
  message?: string
}

export function validateCommitMessage(message: string): ValidationResult {
  if (!message || message.trim().length === 0) {
    return {
      isValid: false,
      message: 'Commit message cannot be empty',
    }
  }

  if (message.trim().length < 3) {
    return {
      isValid: false,
      message: 'Commit message must be at least 3 characters long',
    }
  }

  if (message.trim().length > 500) {
    return {
      isValid: false,
      message: 'Commit message cannot exceed 500 characters',
    }
  }

  // Check for conventional commit format
  const conventionalCommitRegex = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/
  if (!conventionalCommitRegex.test(message.trim())) {
    return {
      isValid: true, // Warning but still valid
      message: 'Consider using conventional commit format: type(scope): description',
    }
  }

  return {
    isValid: true,
  }
}

export function validateBranchName(branchName: string): ValidationResult {
  if (!branchName || branchName.trim().length === 0) {
    return {
      isValid: false,
      message: 'Branch name cannot be empty',
    }
  }

  if (branchName.trim().length < 2) {
    return {
      isValid: false,
      message: 'Branch name must be at least 2 characters long',
    }
  }

  if (branchName.trim().length > 50) {
    return {
      isValid: false,
      message: 'Branch name cannot exceed 50 characters',
    }
  }

  // Check for invalid characters
  const invalidCharsRegex = /[~^:?*[\\]@{}]/
  if (invalidCharsRegex.test(branchName)) {
    return {
      isValid: false,
      message: 'Branch name contains invalid characters',
    }
  }

  // Check for reserved names
  const reservedNames = ['HEAD', 'ORIG_HEAD', 'FETCH_HEAD', 'MERGE_HEAD']
  if (reservedNames.includes(branchName.toUpperCase())) {
    return {
      isValid: false,
      message: 'Branch name is reserved',
    }
  }

  return {
    isValid: true,
  }
}

export function validateTagName(tagName: string): ValidationResult {
  if (!tagName || tagName.trim().length === 0) {
    return {
      isValid: false,
      message: 'Tag name cannot be empty',
    }
  }

  if (tagName.trim().length < 1) {
    return {
      isValid: false,
      message: 'Tag name must be at least 1 character long',
    }
  }

  if (tagName.trim().length > 50) {
    return {
      isValid: false,
      message: 'Tag name cannot exceed 50 characters',
    }
  }

  // Check for invalid characters
  const invalidCharsRegex = /[~^:?*[\\]@{}]/
  if (invalidCharsRegex.test(tagName)) {
    return {
      isValid: false,
      message: 'Tag name contains invalid characters',
    }
  }

  return {
    isValid: true,
  }
}
