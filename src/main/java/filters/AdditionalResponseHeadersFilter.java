package filters;

import java.io.IOException;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.ext.Provider;

@Provider
public class AdditionalResponseHeadersFilter implements ContainerResponseFilter {

	public AdditionalResponseHeadersFilter() {}

	@Override
	public void filter(ContainerRequestContext requestContext, ContainerResponseContext responseContext) throws IOException {
		// Add CORS headers
		responseContext.getHeaders().add("Access-Control-Allow-Methods", "HEAD,GET,PUT,POST,DELETE,OPTIONS");
		responseContext.getHeaders().add("Access-Control-Allow-Origin", "*");
		responseContext.getHeaders().add("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, Authorization");

		// Ensure JSON content type for error responses
		if (responseContext.getStatusInfo().getFamily() == jakarta.ws.rs.core.Response.Status.Family.SERVER_ERROR ||
			responseContext.getStatusInfo().getFamily() == jakarta.ws.rs.core.Response.Status.Family.CLIENT_ERROR) {
			responseContext.getHeaders().putSingle("Content-Type", MediaType.APPLICATION_JSON);
		}
	}
}
