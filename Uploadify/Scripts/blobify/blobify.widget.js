(function ($) {

    // Private "static" variable to store and cache the loaded templates
    // intended to be shared across plugin "instances"
    var templateCache;

    $.widget("sabbour.blobify", {

        // Default options
        options: {
            accountName: "[StorageAccountName]",
            templatesLocation: "/Scripts/blobify/templates",
            sasEndpoint: "/api/blob/obtainsas"
        },

        // Template loading and caching logic
        _getTemplate: function (name) {
            if (Handlebars === undefined)
                console.error("Handlebars is not loaded!");

            if (templateCache === undefined || templateCache[name] === undefined) {
                $.ajax({
                    url: this.options.templatesLocation + "/" + name + ".html",
                    success: function (data) {
                        templateCache = templateCache = {}; // to avoid overriding it if is already created
                        templateCache[name] = Handlebars.compile(data);
                    },
                    async: false
                });
            }
            return templateCache[name];
        },

        // Plugin initialization logic
        _create: function () {
            // Store a reference of "this" to be able to use it inside event bindings
            var self = this;
            this.inputField = this.element;

            // Store the target upload container
            this.targetContainer = this.inputField.data("container");
            if (this.targetContainer === undefined) console.warn("Your template " + this.template + " has no upload container defined.");

            // Get values for the template
            // Get the requested file upload field name
            var fileUploadFieldName = this.inputField.data("fieldname");
            if (fileUploadFieldName === undefined) console.warn("Your input field has no data-filelocation defined, so it won't post to your server.");

            var imageWidth = parseInt(this.inputField.data("data-image-width"));
            var imageHeight = parseInt(this.inputField.data("data-image-height"));
            var title = this.inputField.data("data-title");
            var message = this.inputField.data("data-message");
           
            // this.element: holds the element this has been called on
            // this.options.accountName: holds the account name, etc.

            // Determine the requested template
            this.template = this.inputField.data("template");
            if (this.template == undefined)
                this.template = "default-template";

            // Load the template
            var loadedTemplate = this._getTemplate(this.template);

            // Add context to the template
            var context = { postUploadFieldName: fileUploadFieldName, imageTextAnchorX: imageWidth/2, imageTextAnchorY: imageHeight/2, imageWidth: imageWidth, imageHeight: imageHeight, title: title, message: message };
            var appliedTemplate = jQuery(loadedTemplate(context));

            // Hide the input field (better yet, hide them by default)
            this.inputField.hide();

            // Wrap the input field in a container div and inject the template into it
            this.inputField.wrapAll('<div class="blobify-container"></div>')

            // Store the element's new parent, since we're going to refer to it a lot
            this.containerElement = this.inputField.parent();

            // Append the template to the container
            this.containerElement.append(appliedTemplate);

            // Store the template elements because we'll need them
            // Browse button
            this.browseButton = this.containerElement.find("[data-role='browse-button']");
            if (this.browseButton === undefined) console.warn("Your template " + this.template + " has no elements with a data-role=browse-button");

            // Upload button
            this.uploadButton = this.containerElement.find("[data-role='upload-button']");
            if (this.browseButton === undefined) console.warn("Your template " + this.template + " has no elements with a data-role=upload-button");

            // Progress bar
            this.progressBar = this.containerElement.find("div[role='progressbar']");
            if (this.progressBar === undefined) console.warn("Your template " + this.template + " has no div[role='progressbar']");

            // Status message
            this.statusMessage = this.containerElement.find("[data-role='statusMessage']");
            if (this.statusMessage === undefined) console.warn("Your template " + this.template + " has no elements with a data-role=upload-button");

            // Image preview
            this.imagePreview = this.containerElement.find("img[data-role='image-preview']");

            // If we're going to render the filename, it will be in the template
            this.fileNameField = this.containerElement.find("span[data-role='filename']");

            // Input field that will hold the file location to be posted to the server when submitting the form
            this.postFileLocation = this.containerElement.find("input[data-role='post-filelocation']");
            if (this.postFileLocation === undefined) console.warn("Your template " + this.template + " has no input elements with a data-role=post-filelocation");


            // Now attach the events
            // Click the input element when our pretty browse button is clicked
            $(this.browseButton).click(function () { $(self.element).click() });

            // Attach click handler to Upload button passing our context
            $(this.uploadButton).click(this, this._initializeUpload);

            // Attach the change handler on the input field
            this.inputField.change(function () {
                self.files = self.inputField[0].files; // Store a reference to the files to be uploaded

                // Read properties and set them on the template if found
                // File name
                self.fileNameField.html(self.files[0].name);

                // Thumbnail (if possible)
                if (self.files && self.imagePreview !== undefined) {
                    var reader = new FileReader();

                    reader.onload = function (ein) {
                        self.imagePreview.attr('src', ein.target.result);
                    }

                    reader.readAsDataURL(self.files[0]);
                }

                // Enable the upload button
                self.uploadButton.removeClass("disabled");
            });
        },

        // Checks HTML5 compatibility, disables the controls then obtains a Shared Access Signature from the server
        _initializeUpload: function (e) {
            self = e.data; // e.data is our context, which is "this"


            if (!(window.File && window.Blob && window.FormData)) {
                alert("Please use a modern browser that supports the HTML5 File feature.");
                console.error("Please use a modern browser that supports the HTML5 File feature.");
                return;
            }

            // Disable the buttons when starting
            self._disableControls();

            self.totalUploadedBlocks = 0;
            self.totalNumberOfBlocks = 0;

            var file = (self.files[0]);

            // We're going to support a single file upload, get the first file name
            var fileName = escape(file.name);

            // Obtain a SAS and then begin the upload process
            self._obtainSAS(fileName).done(self._beginUpload).error(self._enableControls);
        },

        // Obtains a SAS to upload to blobName
        // Response is a JSON object with sas,url,fileName and upload_destination
        _obtainSAS: function (blobName) {
            return $.ajax({ url: this.options.sasEndpoint + "?containerName=" + this.targetContainer + "&blobName=" + blobName });
        },

        // Begins the upload process
        _beginUpload: function (sasResponse) {
            if (!sasResponse.sas) {
                alert("There was an error obtaining the token required to upload. Please retry.");
                self._enableControls();
                return;
            }

            // Get the endpoint destination for upload
            self.uploadDestination = sasResponse.upload_destination;
            var fileUrl = sasResponse.url;
            var fileName = sasResponse.fileName;

            // Read the file
            // We will support only a single file upload
            var file = self.files[0];
            if (file != undefined) {
                // Dynamically determine the block size based on file size
                self.fileSizeInKB = file.size / 1024; // get file size
                var minimumBlockSize = 512;
                var maximumBlockSize = 2048;

                self.blockSizeInKB = self.fileSizeInKB / 10; // try to split it into 10 parts but override as per the min and max
                if (self.blockSizeInKB < minimumBlockSize)
                    self.blockSizeInKB = minimumBlockSize;
                else if (self.blockSizeInKB > maximumBlockSize)
                    self.blockSizeInKB = maximumBlockSize;

                // Split the file into chuncks
                // calculate the start and end byte index for each blocks(chunks)
                // with the index, file name and index list for future using
                var blockSize = self.blockSizeInKB * 1024;
                self.blocks = [];
                var offset = 0;
                var index = 0;

                while (offset < self.fileSizeInKB) {
                    var start = offset;
                    var end = Math.min(offset + blockSize, self.fileSizeInKB);
                    var blockId = "block-" + self._pad(self.blocks.length, 6);

                    self.blocks.push({
                        name: fileName,
                        index: index,
                        start: start,
                        end: end,
                        blockId: blockId
                    });

                    offset = end;
                    index++;
                }
                self.totalNumberOfBlocks = self.blocks.length;

                // Prepare the PUT uploads
                // define the function array and push all chunk upload operation into this array
                var putBlocks = [];
                self.blocks.forEach(function (block) {
                    putBlocks.push(function (callback) {
                        // load blob based on the start and end index for each chunks
                        var blob = file.slice(block.start, block.end);

                        var destination = self.uploadDestination + '&comp=block&blockid=' + btoa(blockId);
                        $.ajax({
                            url: destination,
                            type: "PUT",
                            data: blob,
                            processData: false,
                            beforeSend: function (xhr) {
                                console.log('Content-Length: ' + blob.size);
                                xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
                                xhr.setRequestHeader('Content-Length', blob.size);
                            },
                            success: function (data, status) {
                                console.log(data);
                                console.log(status);
                                ++self.totalUploadedBlocks;
                                self._updateProgress();
                                callback(null, block.index);
                            },
                            error: function (xhr, desc, err) {
                                console.log(desc);
                                console.log(err);
                            }
                        });
                    });
                });

                // Initially set progress to zero
                self._updateProgress();

                // Invoke in parallel
                async.parallel(putBlocks, function (error, result) {
                    // After all parallel block uploads are done
                    // We need to call the Blob storage API to commit the list of blocks
                    self._commitBlockList();
                });

            }
        },

        // Commit the chunks
        _commitBlockList: function () {
            var destination = self.uploadDestination + '&comp=blocklist';
            var requestBody = '<?xml version="1.0" encoding="utf-8"?><BlockList>';
            for (var i = 0; i < self.blocks.length; i++) {
                requestBody += '<Latest>' + btoa(self.blocks[i].blockId) + '</Latest>';
            }
            requestBody += '</BlockList>';
            $.ajax({
                url: destination,
                type: "PUT",
                data: requestBody,
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('x-ms-blob-content-type', self.contentType);
                    xhr.setRequestHeader('Content-Length', requestBody.length);
                },
                success: function (data, status) {
                    self._updateProgress();
                },
                error: function (xhr, desc, err) {
                    console.log(desc);
                    console.log(err);
                }
            });
        },

        // Disables the controls
        _disableControls: function () {
            this.uploadButton.addClass("disabled");
            this.browseButton.addClass("disabled");
        },

        // Enables the controls
        _enableControls: function () {
            this.uploadButton.removeClass("disabled");
            this.browseButton.removeClass("disabled");
        },

        _updateProgress: function () {
            var progress = self.totalUploadedBlocks / self.totalNumberOfBlocks * 100;
            if (progress <= 100) {
                console.log(progress);
                self.progressBar.width(parseInt(progress) + "%");
                self._displayStatusMessage("Uploaded " + parseInt(progress) + "%", parent);
            }
            if (progress == 100)
                self.progressBar.removeClass("active");
        },

        _displayStatusMessage: function (message) {
            self.statusMessage.text(message);
        },

        // Helper function to generate properly padded block ids, since they need to be the same length
        _pad: function (number, length) {
            var str = '' + number;
            while (str.length < length) {
                str = '0' + str;
            }
            return str;
        }



    });
})(jQuery);