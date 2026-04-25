import { create } from 'zustand'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'

export interface CommitReviewRecord {
  id: string
  sourceFolderPath: string
  commitId: string
  vcsType: 'git' | 'svn'
  reviewedAt: string
  reviewer?: string
  note?: string
}

interface CommitReviewState {
  markAsReviewed: (
    sourceFolderPath: string,
    commitId: string,
    vcsType: 'git' | 'svn',
    options?: { note?: string; reviewer?: string; reviewerUserId?: string | null }
  ) => Promise<void>
  unmarkReview: (sourceFolderPath: string, commitId: string) => Promise<void>
  isReviewed: (sourceFolderPath: string, commitId: string) => Promise<boolean>
  getReviewedSet: (sourceFolderPath: string) => Promise<Set<string>>
  getReview: (sourceFolderPath: string, commitId: string) => Promise<CommitReviewRecord | null>
  getAllBySourceFolder: (sourceFolderPath: string) => Promise<CommitReviewRecord[]>
}

export const useCommitReviewStore = create<CommitReviewState>(() => ({
  markAsReviewed: async (sourceFolderPath, commitId, vcsType, options) => {
    try {
      const res = await window.api.task.commitReview.save({
        sourceFolderPath,
        commitId,
        vcsType,
        reviewerUserId: options?.reviewerUserId ?? null,
        note: options?.note ?? null,
      })
      if (res.status === 'error') {
        const err = res as { code?: string; message?: string }
        if (err.code === 'UNAUTHORIZED') throw new Error('Vui lòng đăng nhập để thực hiện thao tác này')
        if (err.code === 'FORBIDDEN') throw new Error('Chỉ PL hoặc Admin mới được đánh dấu review')
        throw new Error(err.message)
      }
      logger.success('Đã đánh dấu đã review')
    } catch (error) {
      logger.error('Error marking as reviewed:', error)
      toast.error(error instanceof Error ? error.message : 'Không thể lưu trạng thái review')
    }
  },

  unmarkReview: async (sourceFolderPath, commitId) => {
    try {
      const review = await window.api.task.commitReview.get(sourceFolderPath, commitId)
      const version = review.status === 'success' && review.data ? (review.data as { version?: number }).version : undefined
      const res = await window.api.task.commitReview.delete(sourceFolderPath, commitId, version)
      if (res.status === 'error') {
        const err = res as { code?: string; message?: string }
        if (err.code === 'UNAUTHORIZED') throw new Error('Vui lòng đăng nhập để thực hiện thao tác này')
        if (err.code === 'FORBIDDEN') throw new Error('Chỉ PL hoặc Admin mới được bỏ đánh dấu review')
        throw new Error(err.message)
      }
      logger.success('Đã bỏ đánh dấu review')
    } catch (error) {
      logger.error('Error unmarking review:', error)
      toast.error(error instanceof Error ? error.message : 'Không thể bỏ đánh dấu review')
    }
  },

  isReviewed: async (sourceFolderPath, commitId) => {
    const res = await window.api.task.commitReview.get(sourceFolderPath, commitId)
    return res.status === 'success' && res.data != null
  },

  getReviewedSet: async sourceFolderPath => {
    const res = await window.api.task.commitReview.getReviewedIds(sourceFolderPath)
    if (res.status === 'success' && Array.isArray(res.data)) {
      return new Set(res.data)
    }
    return new Set()
  },

  getReview: async (sourceFolderPath, commitId) => {
    const res = await window.api.task.commitReview.get(sourceFolderPath, commitId)
    if (res.status === 'success' && res.data) {
      const r = res.data
      return {
        id: r.id,
        sourceFolderPath: r.sourceFolderPath,
        commitId: r.commitId,
        vcsType: r.vcsType,
        reviewedAt: r.reviewedAt,
        reviewer: r.reviewerUserId ?? undefined,
        note: r.note ?? undefined,
      }
    }
    return null
  },

  getAllBySourceFolder: async sourceFolderPath => {
    const res = await window.api.task.commitReview.getAllBySourceFolder(sourceFolderPath)
    if (res.status === 'success' && Array.isArray(res.data)) {
      return res.data.map(r => ({
        id: r.id,
        sourceFolderPath: r.sourceFolderPath,
        commitId: r.commitId,
        vcsType: r.vcsType,
        reviewedAt: r.reviewedAt,
        reviewer: r.reviewerUserId ?? undefined,
        note: r.note ?? undefined,
      }))
    }
    return []
  },
}))
