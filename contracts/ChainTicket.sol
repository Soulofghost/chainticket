// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ChainTicket - Anti-Scalping NFT Event Ticketing Protocol
 * @notice Enforces immutable resale price ceilings, organizer royalties, and verifiable gate redemption.
 */
contract ChainTicket {
    struct EventDetails {
        uint256 id;
        address organizer;
        string name;
        uint256 eventTimestamp;
        uint256 faceValue;
        uint256 maxResalePrice;
        uint256 royaltyBps; // e.g. 500 = 5%
        uint256 totalMinted;
        uint256 maxCapacity;
    }

    struct Ticket {
        uint256 tokenId;
        uint256 eventId;
        address currentOwner;
        uint256 purchasePrice;
        bool isRedeemed;
        uint256 redemptionTimestamp;
    }

    uint256 public eventCounter;
    uint256 public tokenCounter;

    mapping(uint256 => EventDetails) public events;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => address) public tokenApprovals;

    event EventCreated(uint256 indexed eventId, address indexed organizer, string name, uint256 faceValue, uint256 maxResalePrice);
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed recipient, uint256 pricePaid);
    event TicketResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 resalePrice, uint256 royaltyPaid);
    event TicketRedeemed(uint256 indexed tokenId, address indexed holder, uint256 timestamp);

    function createEvent(
        string memory _name,
        uint256 _eventTimestamp,
        uint256 _faceValue,
        uint256 _maxResalePrice,
        uint256 _royaltyBps,
        uint256 _maxCapacity
    ) external returns (uint256) {
        require(_faceValue > 0, "Face value must be positive");
        require(_maxResalePrice >= _faceValue, "Max resale must be >= face value");
        require(_royaltyBps <= 2000, "Royalty capped at 20%");
        require(_maxCapacity > 0, "Capacity must be positive");

        eventCounter++;
        uint256 eId = eventCounter;

        events[eId] = EventDetails({
            id: eId,
            organizer: msg.sender,
            name: _name,
            eventTimestamp: _eventTimestamp,
            faceValue: _faceValue,
            maxResalePrice: _maxResalePrice,
            royaltyBps: _royaltyBps,
            totalMinted: 0,
            maxCapacity: _maxCapacity
        });

        emit EventCreated(eId, msg.sender, _name, _faceValue, _maxResalePrice);
        return eId;
    }

    function mintTicket(uint256 _eventId) external payable returns (uint256) {
        EventDetails storage ev = events[_eventId];
        require(ev.id != 0, "Event does not exist");
        require(ev.totalMinted < ev.maxCapacity, "Event is sold out");
        require(msg.value >= ev.faceValue, "Insufficient payment for ticket face value");

        tokenCounter++;
        uint256 tId = tokenCounter;

        tickets[tId] = Ticket({
            tokenId: tId,
            eventId: _eventId,
            currentOwner: msg.sender,
            purchasePrice: ev.faceValue,
            isRedeemed: false,
            redemptionTimestamp: 0
        });

        ev.totalMinted++;

        // Send payment to event organizer
        (bool sent, ) = payable(ev.organizer).call{value: ev.faceValue}("");
        require(sent, "Organizer payment transfer failed");

        // Refund any excess
        if (msg.value > ev.faceValue) {
            payable(msg.sender).transfer(msg.value - ev.faceValue);
        }

        emit TicketMinted(tId, _eventId, msg.sender, ev.faceValue);
        return tId;
    }

    function resellTicket(uint256 _tokenId, address _to, uint256 _resalePrice) external payable {
        Ticket storage tk = tickets[_tokenId];
        require(tk.tokenId != 0, "Ticket does not exist");
        require(tk.currentOwner == msg.sender, "Caller is not ticket owner");
        require(!tk.isRedeemed, "Redeemed ticket cannot be transferred");
        require(_to != address(0), "Invalid recipient");

        EventDetails storage ev = events[tk.eventId];
        require(_resalePrice <= ev.maxResalePrice, "Resale price exceeds anti-scalping price ceiling");
        require(msg.value >= _resalePrice, "Insufficient funds provided for secondary purchase");

        uint256 royalty = (_resalePrice * ev.royaltyBps) / 10000;
        uint256 sellerProceeds = _resalePrice - royalty;

        tk.currentOwner = _to;
        tk.purchasePrice = _resalePrice;

        // Disburse royalty to organizer
        if (royalty > 0) {
            (bool rSent, ) = payable(ev.organizer).call{value: royalty}("");
            require(rSent, "Royalty transfer failed");
        }

        // Disburse proceeds to seller
        (bool sSent, ) = payable(msg.sender).call{value: sellerProceeds}("");
        require(sSent, "Seller proceeds transfer failed");

        emit TicketResold(_tokenId, msg.sender, _to, _resalePrice, royalty);
    }

    function checkIn(uint256 _tokenId) external {
        Ticket storage tk = tickets[_tokenId];
        require(tk.tokenId != 0, "Ticket does not exist");
        require(!tk.isRedeemed, "Ticket has already been redeemed at gate");

        EventDetails storage ev = events[tk.eventId];
        require(msg.sender == ev.organizer || msg.sender == tk.currentOwner, "Only organizer or ticket holder can check in");

        tk.isRedeemed = true;
        tk.redemptionTimestamp = block.timestamp;

        emit TicketRedeemed(_tokenId, tk.currentOwner, block.timestamp);
    }
}
