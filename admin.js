jQuery(document).ready(function ($) {
    // Initialize orphan scanner
    initializeOrphanScanner($);

    // Add batch selection handlers
    initializeBatchSelectionHandlers($);

    // Add automated batch deletion handler for orphan files
    initializeAutomatedBatchDeletion($);
});

function initializeOrphanScanner($) {
    $('#scan-orphan-files-btn').on('click', function (e) {
        e.preventDefault();

        var $button = $(this);
        var $spinner = $button.siblings('.spinner');
        var $resultsContainer = $('#orphan-scan-results');
        var $formContainer = $('#orphan-scan-form-container');

        $button.prop('disabled', true);
        $spinner.addClass('is-active');
        $resultsContainer.html('<p>' + cleanup_images.scanning_text + '</p>').show();
        $formContainer.hide();

        $.ajax({
            url: cleanup_images.ajax_url,
            type: 'POST',
            data: {
                action: 'cleanup_images_scan_orphans',
                _ajax_nonce: cleanup_images.scan_nonce
            },
            success: function (response) {
                $spinner.removeClass('is-active');
                $button.prop('disabled', false);

                if (response.success) {
                    var orphan_files = response.data.orphan_files;
                    var all_files = response.data.all_files;

                    // Populate debug area
                    if (all_files && all_files.length > 0) {
                        $('#all-files-debug').val(all_files.join('\n'));
                        $('#all-files-debug-container').show();
                    } else {
                        $('#all-files-debug').val('No files found at all.');
                        $('#all-files-debug-container').show();
                    }


                    if (orphan_files.length > 0) {
                        var tableBody = '';
                        orphan_files.forEach(function (file) {
                            tableBody += '<tr>';
                            tableBody += '<th scope="row" class="check-column"><input type="checkbox" name="orphan_files_to_delete[]" value="' + file.path + '"></th>';
                            // Display path relative to uploads directory
                            tableBody += '<td>' + file.path.replace(cleanup_images.upload_base_dir, '') + '</td>';
                            tableBody += '</tr>';
                        });
                        $('#orphan-files-table tbody').html(tableBody);
                        $formContainer.show();
                        $resultsContainer.html('').hide(); // Clear "Scanning..." message and hide
                    } else {
                        $resultsContainer.html('<div class="notice notice-success inline"><p>' + cleanup_images.no_orphans_found_text + '</p></div>');
                    }
                } else {
                    $resultsContainer.html('<div class="notice notice-error inline"><p>' + cleanup_images.error_text + ' ' + (response.data ? response.data.message : '') + '</p></div>');
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                $spinner.removeClass('is-active');
                $button.prop('disabled', false);
                $resultsContainer.html('<div class="notice notice-error inline"><p>' + cleanup_images.error_text + ' (AJAX error: ' + textStatus + ')</p></div>');
                console.error("Cleanup Images AJAX Error:", textStatus, errorThrown, jqXHR.responseText);
            }
        });
    });

    // Handle "select all" checkbox for orphans
    $('#orphan-files-select-all').on('click', function () {
        var $checkboxes = $('#orphan-files-table tbody').find('input[type="checkbox"]');
        $checkboxes.prop('checked', $(this).prop('checked'));
    });
}

function initializeBatchSelectionHandlers($) {
    // Select First 100 button handler
    $(document).on('click', '.select-first-100', function (e) {
        e.preventDefault();
        var $checkboxes = $(this).closest('form').find('input[type="checkbox"][name*="[]"]');
        $checkboxes.prop('checked', false); // Uncheck all first
        $checkboxes.slice(0, 100).prop('checked', true); // Check first 100
    });

    // Select None button handler
    $(document).on('click', '.select-none', function (e) {
        e.preventDefault();
        var $checkboxes = $(this).closest('form').find('input[type="checkbox"][name*="[]"]');
        $checkboxes.prop('checked', false);
    });
}

function initializeAutomatedBatchDeletion($) {
    $(document).on('click', '#delete-all-orphans-automated', function (e) {
        e.preventDefault();

        if (!confirm('This will delete ALL orphan images in automated batches. This action cannot be undone. Are you sure?')) {
            return;
        }

        var $button = $(this);
        var $progressContainer = $('#batch-deletion-progress');
        var $resultsContainer = $('#orphan-scan-results');

        // Collect all orphan file paths
        var orphanFiles = [];
        $('#orphan-files-table tbody input[type="checkbox"]').each(function () {
            orphanFiles.push($(this).val());
        });

        if (orphanFiles.length === 0) {
            alert('No orphan files to delete.');
            return;
        }

        // Setup progress tracking
        var totalFiles = orphanFiles.length;
        var deletedCount = 0;
        var failedCount = 0;
        var batchSize = 100;
        var currentBatch = 0;

        $button.prop('disabled', true);
        $progressContainer.html('<div class="notice notice-info"><p>Starting automated batch deletion...</p></div>').show();

        function processBatch() {
            var startIndex = currentBatch * batchSize;
            var endIndex = Math.min(startIndex + batchSize, totalFiles);
            var currentBatchFiles = orphanFiles.slice(startIndex, endIndex);

            if (currentBatchFiles.length === 0) {
                // All done
                var successMessage = deletedCount + ' images deleted successfully.';
                if (failedCount > 0) {
                    successMessage += ' ' + failedCount + ' images failed to delete.';
                }

                $progressContainer.html('<div class="notice notice-success"><p>' + successMessage + '</p></div>');
                $button.prop('disabled', false);

                // Refresh the page to show updated results
                setTimeout(function () {
                    window.location.reload();
                }, 2000);

                return;
            }

            // Update progress
            var progress = Math.round((deletedCount + failedCount) / totalFiles * 100);
            $progressContainer.html(
                '<div class="notice notice-info">' +
                '<p>Processing batch ' + (currentBatch + 1) + '... (' + progress + '% complete)</p>' +
                '<p>Deleted: ' + deletedCount + ' | Failed: ' + failedCount + ' | Remaining: ' + (totalFiles - deletedCount - failedCount) + '</p>' +
                '</div>'
            );

            // Send AJAX request for current batch
            $.ajax({
                url: cleanup_images.ajax_url,
                type: 'POST',
                data: {
                    action: 'cleanup_images_delete_orphans_ajax',
                    orphan_files: currentBatchFiles,
                    _ajax_nonce: cleanup_images.delete_nonce
                },
                success: function (response) {
                    if (response.success) {
                        deletedCount += response.data.deleted;
                        failedCount += response.data.failed;
                    } else {
                        failedCount += currentBatchFiles.length;
                        console.error('Batch deletion error:', response.data);
                    }

                    currentBatch++;
                    setTimeout(processBatch, 500); // Small delay between batches
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.error("Batch deletion AJAX error:", textStatus, errorThrown, jqXHR.responseText);
                    failedCount += currentBatchFiles.length;
                    currentBatch++;
                    setTimeout(processBatch, 1000); // Longer delay on error
                }
            });
        }

        // Start processing
        processBatch();
    });
}
