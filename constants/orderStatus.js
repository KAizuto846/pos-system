// constants/orderStatus.js - Estados de pedidos de proveedor
const ORDER_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  SENT: 'sent',
  PARTIAL_RECEIVED: 'partial_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled'
};

const VALID_STATUSES = Object.values(ORDER_STATUS);

module.exports = { ORDER_STATUS, VALID_STATUSES };
