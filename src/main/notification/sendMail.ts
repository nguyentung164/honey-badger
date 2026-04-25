import path from 'node:path'
import l from 'electron-log'
import type { CommitInfo } from 'main/types/types'
import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import configurationStore from '../store/ConfigurationStore'
import mailServerStore from '../store/MailServerStore'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { getPlEmailsForProject, getProjectIdByUserAndPath } from '../task/mysqlTaskStore'

function normalizePath(p: string): string {
  return path.normalize(path.resolve(p))
}

export async function sendMail(data: CommitInfo): Promise<void> {
  try {
    const session = getTokenFromStore() ? verifyToken(getTokenFromStore()!) : null
    if (!session) {
      l.info('sendMail: No session, skip')
      return
    }
    const pathToUse = data.sourceFolderPath ?? configurationStore.store.sourceFolder
    if (!pathToUse?.trim()) {
      l.info('sendMail: No sourceFolder, skip')
      return
    }
    const normalizedPath = normalizePath(pathToUse)
    const projectId = await getProjectIdByUserAndPath(session.userId, normalizedPath)
    if (!projectId) {
      l.info('sendMail: No project mapping for path, skip')
      return
    }
    const recipients = await getPlEmailsForProject(projectId)
    if (recipients.length === 0) {
      l.info('sendMail: No PL recipients with email and receive_commit_notification, skip')
      return
    }

    const {
      commitUser,
      commitTime,
      commitMessage,
      addedFiles,
      modifiedFiles,
      deletedFiles,
      hasCheckCodingRule,
      hasCheckSpotbugs,
      commitHash,
      revision,
      branchName,
      projectName,
      insertions,
      deletions,
    } = data
    l.info('🎯 Sending HTML email...')
    const { smtpServer, port, email, password } = mailServerStore.store
    const addedFilesHtml = `<ul>${addedFiles.map(file => `<li>${file}</li>`).join('')}</ul>`
    const modifiedFilesHtml = `<ul>${modifiedFiles.map(file => `<li>${file}</li>`).join('')}</ul>`
    const deletedFilesHtml = `<ul>${deletedFiles.map(file => `<li>${file}</li>`).join('')}</ul>`

    const projectNameVal = projectName ?? (pathToUse ? path.basename(normalizedPath) : undefined)
    const totalFiles = addedFiles.length + modifiedFiles.length + deletedFiles.length
    const statsParts: string[] = []
    if (insertions != null) statsParts.push(`+${insertions}`)
    if (deletions != null) statsParts.push(`-${deletions}`)
    const statsStr = statsParts.length > 0 ? statsParts.join(' ') : undefined
    const commitIdLabel = data.vcsType === 'svn' ? 'Revision' : 'Commit Hash'
    const commitIdVal = commitHash ?? (revision ? `r${revision}` : undefined)

    const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>Commit Notification</title>
          <style>
            body {
              font-family: 'Roboto', Arial, sans-serif;
              background-color: #f4f4f4;
              font-size: .9rem;
              padding: 20px;
            }
            .container {
              margin: 0 auto;
              background-color: #fff;
              border-radius: 5px;
              box-shadow: 0 0 10px rgba(0, 0, 0, .1);
              padding: 20px;
            }
            p {
              line-height: 1;
              margin-bottom: 2px;
            }
            ul {
              padding-left: 20px;
              margin: 0 !important;
              list-style-type: auto;
            }
            pre {
              background: #ffffca !important;
              margin-top: 5px;
              margin-bottom: 10px;
              padding: 10px;
              border-radius: 5px;
              font-family: Calibri;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 10px 12px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background-color: #f8f9fa;
              font-weight: 600;
              width: 180px;
            }
            th.full, td.full {
              width: auto;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <table>
              <tr><th>Commit User</th><td>${commitUser}</td></tr>
              <tr><th>Commit Time</th><td>${commitTime}</td></tr>
              ${commitIdVal ? `<tr><th>${commitIdLabel}</th><td>${commitIdVal}</td></tr>` : ''}
              ${branchName ? `<tr><th>Branch</th><td>${branchName}</td></tr>` : ''}
              ${projectNameVal ? `<tr><th>Project</th><td>${projectNameVal}</td></tr>` : ''}
              <tr><th>Check Coding Rule</th><td style="color: ${hasCheckCodingRule ? '#28A745' : '#DC3545'}">${hasCheckCodingRule ? '✅ Đã kiểm tra' : '❌ Không kiểm tra'}</td></tr>
              <tr><th>Check Spotbugs</th><td style="color: ${hasCheckSpotbugs ? '#28A745' : '#DC3545'}">${hasCheckSpotbugs ? '✅ Đã kiểm tra' : '❌ Không kiểm tra'}</td></tr>
              <tr><th>Total Files</th><td>${totalFiles}</td></tr>
              ${statsStr ? `<tr><th>Stats</th><td>${statsStr}</td></tr>` : ''}
              <tr><th colspan="2" class="full">Commit Message</th></tr>
              <tr><td colspan="2" class="full"><pre>${commitMessage}</pre></td></tr>
              ${addedFiles.length > 0 ? `<tr><th colspan="2" class="full" style="color: #28A745">Added Files (${addedFiles.length})</th></tr><tr><td colspan="2" class="full"><pre style="white-space: normal !important">${addedFilesHtml}</pre></td></tr>` : ''}
              ${modifiedFiles.length > 0 ? `<tr><th colspan="2" class="full" style="color: #007BFF">Modified Files (${modifiedFiles.length})</th></tr><tr><td colspan="2" class="full"><pre style="white-space: normal !important">${modifiedFilesHtml}</pre></td></tr>` : ''}
              ${deletedFiles.length > 0 ? `<tr><th colspan="2" class="full" style="color: #DC3545">Deleted Files (${deletedFiles.length})</th></tr><tr><td colspan="2" class="full"><pre style="white-space: normal !important">${deletedFilesHtml}</pre></td></tr>` : ''}
            </table>
          </div>
        </body>
      </html>
    `

    const smtpOptions: SMTPTransport.Options = {
      host: smtpServer,
      port: Number(port),
      secure: false,
      auth: {
        user: email,
        pass: password,
      },
    }

    const transporter = nodemailer.createTransport(smtpOptions)
    await transporter.sendMail({
      from: email,
      to: recipients.join(', '),
      subject: 'Commit Notification',
      html: htmlContent,
    })

    l.info(`✅ Email sent to ${recipients.join(', ')} successfully!`)
  } catch (error) {
    l.error(`Error sending email: ${error}`)
  }
}

export interface SendWelcomeEmailParams {
  to: string
  userCode: string
  name: string
  email: string
  password: string
}

export async function sendWelcomeEmail(params: SendWelcomeEmailParams): Promise<void> {
  const { to, userCode, name, email: userEmail, password } = params
  try {
    const { smtpServer, port, email, password: smtpPassword } = mailServerStore.store
    if (!smtpServer?.trim() || !port?.trim() || !email?.trim() || !smtpPassword?.trim()) {
      l.info('sendWelcomeEmail: SMTP not configured, skip sending')
      return
    }
    const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>User Registration</title>
          <style>
            body { font-family: 'Roboto', Arial, sans-serif; background-color: #f4f4f4; font-size: .9rem; padding: 20px; }
            .container { margin: 0 auto; background-color: #fff; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,.1); padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; }
            th { background-color: #f8f9fa; font-weight: 600; width: 180px; }
          </style>
        </head>
        <body>
          <div class="container">
            <p>Thông tin đăng ký user của bạn:</p>
            <table>
              <tr><th>User Code</th><td>${escapeHtml(userCode)}</td></tr>
              <tr><th>Name</th><td>${escapeHtml(name)}</td></tr>
              <tr><th>Email</th><td>${escapeHtml(userEmail)}</td></tr>
              <tr><th>Password</th><td><strong>${escapeHtml(password)}</strong></td></tr>
            </table>
            <p style="margin-top: 16px; color: #666;">Vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên.</p>
          </div>
        </body>
      </html>
    `
    const smtpOptions: SMTPTransport.Options = {
      host: smtpServer,
      port: Number(port),
      secure: false,
      auth: { user: email, pass: smtpPassword },
    }
    const transporter = nodemailer.createTransport(smtpOptions)
    await transporter.sendMail({
      from: email,
      to: to.trim(),
      subject: 'Thông tin đăng ký user / User registration info',
      html: htmlContent,
    })
    l.info(`✅ Welcome email sent to ${to} successfully!`)
  } catch (error) {
    l.error(`sendWelcomeEmail error: ${error}`)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
