using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using System;
using System.Collections.Generic;
using System.Configuration;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Web.Http;

namespace Uploadify.Controllers
{
    public class BlobController : ApiController
    {
        [HttpGet]
        [ActionName("obtainsas")]
        public HttpResponseMessage ObtainSAS(string containerName, string blobName)
        {
            // Sanity checks
            try
            {
                ContainerSanityCheck(containerName);
            }
            catch (ArgumentException e)
            {
                return Request.CreateErrorResponse(HttpStatusCode.BadRequest, e.Message);
            }
    
            // Parse the connection string and return a reference to the storage account
            var storageAccount = CloudStorageAccount.Parse(ConfigurationManager.ConnectionStrings["StorageConnectionString"].ConnectionString);

            // Create the blob client object.
            var blobClient = storageAccount.CreateCloudBlobClient();

            // Get a reference to the container to use, and create it if it does not exist
            var container = blobClient.GetContainerReference(containerName);
            container.CreateIfNotExists();

            // Set the expiry time and permissions for the container
            var sasConstraints = new SharedAccessBlobPolicy
            {
                SharedAccessStartTime = DateTime.UtcNow.AddMinutes(5), // To account for time differences
                SharedAccessExpiryTime = DateTime.UtcNow.AddHours(4),
                Permissions = SharedAccessBlobPermissions.Write | SharedAccessBlobPermissions.List
            };

            // Generate the shared access signature on the container, setting the constraints directly on the signature.
            string sasContainerToken = container.GetSharedAccessSignature(sasConstraints);

            // Creat the URI to be return to the client that will be used to write to blob storage.
            var response = new { 
                sas = sasContainerToken,
                url = string.Format("{0}/{1}",container.Uri,blobName),
                upload_destination = string.Format("{0}/{1}{2}", container.Uri, blobName, sasContainerToken)
            };

            //Return the URI string for the container, including the SAS token.
            return Request.CreateResponse(response);
        }

        /// <summary>
        /// Performs checks on the validity of the container name
        /// </summary>
        /// <param name="containerName"></param>
        private void ContainerSanityCheck(string containerName)
        {
            if (string.IsNullOrWhiteSpace(containerName))
                throw new ArgumentException("Container names cannot be empty.");

            if(containerName.Length < 3 || containerName.Length > 63)
                throw new ArgumentException("Container names must be from 3 through 63 characters long.");
            
            if (!Regex.IsMatch(containerName, @"^([a-z0-9\-])+$"))
                throw new ArgumentException("Container names must start with a letter or number, and can contain only lowercase letters, numbers, and the dash (-) character.");

            //if (!Regex.IsMatch(containerName, @"^(([\-])([a-z0-9])+)*$"))
            //    throw new ArgumentException("Every dash (-) character must be immediately preceded and followed by a letter or number; consecutive dashes are not permitted in container names.");
        }
    }
}
