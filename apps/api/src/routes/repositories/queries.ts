export type Issue = {
  id: string
  number: number
  title: string
  bodyText: string
  state: "OPEN" | "CLOSED"
}

export type PullRequest = {
  id: string
  number: number
  title: string
  bodyText: string
  state: "OPEN" | "CLOSED" | "MERGED"
  files: {
    nodes: Array<{ path: string }>
  }
}

export type PageInfo = {
  hasNextPage: boolean
  endCursor: string | null
}

export type GraphQLResponse = {
  repository: {
    issues: {
      nodes: Array<Issue>
      pageInfo: PageInfo
    }
    pullRequests: {
      nodes: Array<PullRequest>
      pageInfo: PageInfo
    }
  }
}

export const FETCH_ISSUES_QUERY = /* GraphQL */ `
  query (
    $owner: String!
    $repo: String!
    $first: Int!
    $after: String
    $since: DateTime
  ) {
    repository(owner: $owner, name: $repo) {
      issues(
        first: $first
        after: $after
        filterBy: { states: OPEN, since: $since }
      ) {
        nodes {
          id
          number
          title
          bodyText
          state
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`

export const FETCH_PULL_REQUESTS_QUERY = /* GraphQL */ `
  query ($owner: String!, $repo: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: $first, after: $after, states: OPEN) {
        nodes {
          id
          number
          title
          bodyText
          state
          files(first: 100) {
            nodes {
              path
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`
