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
            // In a real situation, you wouldn't accept just any container name and you would usually
            // create containers and blobs based on some business logic rules

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

            // Enable CORS to allow the javascript code to directly talk to our blob storage
            // For better security, we can explicitly set the allowed origins to the domain hosting our javascript
            // to ensure that only our domain is able to upload to the blob storage
            EnableCORS(blobClient, allowedOrigins: "*");

            // Get a reference to the container to use, and create it if it does not exist
            var container = blobClient.GetContainerReference(containerName);
            container.CreateIfNotExists();

            // Set the expiry time and permissions for the container
            var sasConstraints = new SharedAccessBlobPolicy
            {
                SharedAccessStartTime = DateTime.UtcNow.AddMinutes(-5), // To account for time differences
                SharedAccessExpiryTime = DateTime.UtcNow.AddHours(4),
                Permissions = SharedAccessBlobPermissions.Write | SharedAccessBlobPermissions.List
            };

            // Generate the shared access signature on the container, setting the constraints directly on the signature.
            string sasContainerToken = container.GetSharedAccessSignature(sasConstraints);

            // Creat the URI to be return to the client that will be used to write to blob storage.
            var response = new
            {
                sas = sasContainerToken,
                url = string.Format("{0}/{1}", container.Uri, blobName),
                fileName = blobName,
                upload_destination = string.Format("{0}/{1}{2}", container.Uri, blobName, sasContainerToken)
            };

            //Return the URI string for the container, including the SAS token.
            return Request.CreateResponse(response);
        }

        private static void EnableCORS(CloudBlobClient blobClient, string allowedOrigins = "*")
        {
            // Get current properties
            var currentProperties = blobClient.GetServiceProperties();

            // Ensure we're using a version that supports CORS (2013 does, but let's use the latest)
            currentProperties.DefaultServiceVersion = "2014-02-14"; // "2013-08-15"; //"2012-02-12"; // "2011-08-18"; // null;
            blobClient.SetServiceProperties(currentProperties);

            
            //Add a wide open rule to allow uploads if not exists
            var ruleWideOpenWriter = new Microsoft.WindowsAzure.Storage.Shared.Protocol.CorsRule()
            {
                AllowedHeaders = { "*" },
                AllowedOrigins = { allowedOrigins }, // urls to allow requests from
                AllowedMethods =
                    Microsoft.WindowsAzure.Storage.Shared.Protocol.CorsHttpMethods.Options |
                    Microsoft.WindowsAzure.Storage.Shared.Protocol.CorsHttpMethods.Post |
                    Microsoft.WindowsAzure.Storage.Shared.Protocol.CorsHttpMethods.Put |
                    Microsoft.WindowsAzure.Storage.Shared.Protocol.CorsHttpMethods.Merge,
                ExposedHeaders = { "*" },
                MaxAgeInSeconds = (int)TimeSpan.FromDays(5).TotalSeconds
            };

            // Only if the rule doesn't exist (hacky)
            if(!currentProperties.Cors.CorsRules.Any( rule => rule.AllowedHeaders.First() == "*"))
                currentProperties.Cors.CorsRules.Add(ruleWideOpenWriter);

            blobClient.SetServiceProperties(currentProperties);
        }

        /// <summary>
        /// Performs checks on the validity of the container name
        /// </summary>
        /// <param name="containerName"></param>
        private void ContainerSanityCheck(string containerName)
        {
            if (string.IsNullOrWhiteSpace(containerName))
                throw new ArgumentException("Container names cannot be empty.");

            if (containerName.Length < 3 || containerName.Length > 63)
                throw new ArgumentException("Container names must be from 3 through 63 characters long.");

            if (!Regex.IsMatch(containerName, @"^([a-z0-9\-])+$"))
                throw new ArgumentException("Container names must start with a letter or number, and can contain only lowercase letters, numbers, and the dash (-) character.");

            //if (!Regex.IsMatch(containerName, @"^(([\-])([a-z0-9])+)*$"))
            //    throw new ArgumentException("Every dash (-) character must be immediately preceded and followed by a letter or number; consecutive dashes are not permitted in container names.");
        }
    }
}
