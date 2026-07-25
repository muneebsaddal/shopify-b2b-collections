/**
 * Narrow Shopify Admin API documents for F2 development-store proof.
 *
 * These documents intentionally avoid customer names, phone numbers,
 * addresses, notes, marketing data, and broad customer order history. Shopify
 * remains authoritative; later synchronization code will consume these
 * documents without treating webhook payloads as the ledger.
 */

export const SHOP_INSTALLATION_CONTRACT_QUERY = `#graphql
  query F2ShopInstallationContract {
    shop {
      id
      myshopifyDomain
      ianaTimezone
    }
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

export const COMPANIES_CONTRACT_QUERY = `#graphql
  query F2CompaniesContract($first: Int!, $after: String) {
    companies(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        updatedAt
        locations(first: 25) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            name
            createdAt
            updatedAt
            company {
              id
            }
          }
        }
        contacts(first: 25) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            createdAt
            updatedAt
            company {
              id
            }
            customer {
              id
              defaultEmailAddress {
                emailAddress
              }
            }
          }
        }
      }
    }
  }
`;

const MONEY_BAG_FIELDS = `#graphql
  fragment F2MoneyBagFields on MoneyBag {
    shopMoney {
      amount
      currencyCode
    }
    presentmentMoney {
      amount
      currencyCode
    }
  }
`;

export const RECEIVABLE_ORDER_CONTRACT_QUERY = `#graphql
  ${MONEY_BAG_FIELDS}
  query F2ReceivableOrderContract($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      updatedAt
      cancelledAt
      closedAt
      displayFinancialStatus
      unpaid
      currencyCode
      totalPriceSet {
        ...F2MoneyBagFields
      }
      currentTotalPriceSet {
        ...F2MoneyBagFields
      }
      totalOutstandingSet {
        ...F2MoneyBagFields
      }
      totalReceivedSet {
        ...F2MoneyBagFields
      }
      totalRefundedSet {
        ...F2MoneyBagFields
      }
      purchasingEntity {
        ... on PurchasingCompany {
          company {
            id
          }
          location {
            id
          }
          contact {
            id
          }
        }
      }
      paymentTerms {
        id
        due
        dueInDays
        overdue
        paymentTermsName
        paymentTermsType
        paymentSchedules(first: 20) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            balanceDue {
              amount
              currencyCode
            }
            totalBalance {
              amount
              currencyCode
            }
            due
            dueAt
            issuedAt
            completedAt
          }
        }
      }
      refunds {
        id
        createdAt
        updatedAt
        totalRefundedSet {
          ...F2MoneyBagFields
        }
      }
      transactions {
        id
        createdAt
        kind
        status
        amountSet {
          ...F2MoneyBagFields
        }
      }
    }
  }
`;

export const RECEIVABLE_ORDERS_PAGE_CONTRACT_QUERY = `#graphql
  query F2ReceivableOrdersPageContract(
    $first: Int!
    $after: String
    $query: String!
  ) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        updatedAt
      }
    }
  }
`;
