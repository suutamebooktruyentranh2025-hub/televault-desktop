export async function retryGDriveErrorsSequentially(failed_errors, retry_action) {
  for (const failed_error of failed_errors) {
    await retry_action(failed_error.driveFileId);
  }
}
